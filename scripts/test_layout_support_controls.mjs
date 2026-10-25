// Actual UI/app/state source with fresh DOM fixtures; no model or height-fit claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),at=process.argv.indexOf('--site');
const site=at<0?path.join(root,'site'):path.resolve(process.argv[at+1]);
const S=await import(pathToFileURL(path.join(site,'layout/layout-state.mjs')));
const {createLayoutUI}=await import(pathToFileURL(path.join(site,'layout/layout-ui.mjs')));
const {createLayoutTranslator}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const app=fs.readFileSync(path.join(site,'layout/layout-app.mjs'),'utf8');
const catalog=JSON.parse(fs.readFileSync(path.join(site,'layout/layout-catalog.json'),'utf8')).machines.map(m=>({...m,widthMm:m.dimensionsMm.width,depthMm:m.dimensionsMm.depth,heightMm:m.dimensionsMm.height}));
const machine=catalog.find(m=>m.id==='elegoo_neptune3plus_reference');assert(machine,'Exact registered human-reported machine must exist');
const pins=['layout/layout-ui.mjs','layout/layout-app.mjs','layout/layout-state.mjs','layout/layout-catalog.json','layout/layout-i18n.mjs'];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),before=Object.fromEntries(pins.map(p=>[p,hash(path.join(site,p))]));
const results=[],observations=[];
async function test(name,run){try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.stack});}}
const printer=(id,attachment)=>({id,machineId:machine.id,configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:3000,zMm:0,yawDeg:0,...attachment}});
function seed(attachment={},peer=false){
 const desk=S.createDesk({id:'desk',widthMm:2000,depthMm:1800,heightMm:750,pose:{xMm:1500,zMm:0,yawDeg:0}});
 const shelf=S.createShelf({id:'shelf',widthMm:1600,depthMm:1400,heightMm:5000,pose:{xMm:-1700,zMm:0,yawDeg:0},levels:[{id:'lower',topMm:1000},{id:'upper',topMm:3500}]});
 return S.createDefaultLayout({room:S.createRoomRect({widthMm:12000,depthMm:12000}),furniture:[desk,shelf],printers:[printer('neptune',attachment),...(peer?[printer('peer',{xMm:0,zMm:0})]:[])]},catalog);
}
function fixture(initial,{language='en',recordOnly=false}={}){
 const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p');status.id='layout-status';document.body.append(status,container);
 document.location={href:'https://example.test/rig/layout/index.html'};document.documentElement={lang:language};
 const t=createLayoutTranslator(language),actions=[],promises=[];
 const section=(a,b)=>{const i=app.indexOf(a),j=app.indexOf(b,i+a.length);assert(i>=0&&j>i,'App source section missing');return app.slice(i,j)};
 // Only storage/view/status ports are fixtures. The rejection catch, sync,
 // state validation and history/commit bodies execute unchanged app source.
 const engine=Function('initial','catalog','S','document','t',`const {applyAction,validatePlacement,serializeLayout}=S;
  let state=initial,selected='neptune',busy=false,roomEditing=false,disposed=false,placement=null,operation=null,interactionGeneration=0,ui=null;
  const past=[],future=[],writes=[],frames=[],view={setState:(...a)=>frames.push(a)},$=s=>document.body.querySelector(s),store=()=>writes.push(serializeLayout(state,catalog));
  ${section('function message(','async function ensureEquipmentPreview(')}
  ${section('async function act(','function updateViewPresentation(')}
  return {act,bind(value){ui=value;sync()},replace(next,id=selected){state=next;selected=id;sync()},read:()=>({state,past,writes,frames,status:$('#layout-status').textContent})};`)(initial,catalog,S,document,t);
 const ui=createLayoutUI({container,catalog,t,onAction:action=>{actions.push(structuredClone(action));if(recordOnly)return;const promise=engine.act(action);promises.push(promise);return promise;}});
 engine.bind(ui);
 const field=name=>container.querySelector(`[data-layout-field="${name}"]`);
 return {ui,engine,document,container,actions,t,field,support:()=>container.querySelector('#layout-support'),async settle(){await Promise.all(promises);await Promise.resolve();},dispose(){ui.dispose()}};
}
const label=x=>x.container.querySelector('[data-layout-i18n="layout.surfacePosition"]')||x.container.querySelector('[data-layout-i18n="layout.floorPosition"]');
await test('floor-and-supported-position-labels-follow-actual-attachment-in-all-languages',async()=>{
 for(const language of ['en','ja','es','ko','ru']){
  const x=fixture(seed(),{language});
  assert.equal(label(x).dataset.layoutI18n,'layout.floorPosition');assert.equal(label(x).textContent,x.t('layout.floorPosition'));
  x.support().value=JSON.stringify(['desk','top']);x.support().dispatch('change');await x.settle();
  assert.equal(label(x).dataset.layoutI18n,'layout.surfacePosition');assert.equal(label(x).textContent,x.t('layout.surfacePosition'));
  assert.equal(x.engine.read().state.printers[0].attachment.parentId,'desk');
  x.support().value=JSON.stringify([null,'floor']);x.support().dispatch('change');await x.settle();
  assert.equal(label(x).dataset.layoutI18n,'layout.floorPosition');x.dispose();
 }
});
await test('rejected-floor-transition-restores-focused-select-and-poses-with-no-history',async()=>{
 const initial=seed({parentId:'desk',surfaceId:'top',xMm:37.125,zMm:-23.75,yawDeg:0.1},true),saved=S.serializeLayout(initial,catalog),x=fixture(initial);
 const action={type:'SET_ATTACHMENT',id:'neptune',attachment:{parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0}};
 assert.throws(()=>S.applyAction(initial,action,catalog),e=>e instanceof S.LayoutValidationError&&e.errors.some(p=>p.code==='ENVELOPE_OVERLAP'));
 const support=x.support(),pose=Object.fromEntries(['xMm','zMm','yawDeg'].map(k=>[k,x.field(k).value]));
 support.focus();support.value=JSON.stringify([null,'floor']);support.dispatch('change');await x.settle();
 assert.equal(x.engine.read().state,initial);assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);
 assert.equal(x.support(),support,'Rejection must not need a selection-signature rebuild');assert.equal(support.value,JSON.stringify(['desk','top']));
 for(const [name,value]of Object.entries(pose))assert.equal(x.field(name).value,value);
 assert.equal(label(x).dataset.layoutI18n,'layout.surfacePosition');assert.equal(x.engine.read().past.length,0);assert.equal(x.engine.read().writes.length,0);
 assert(x.engine.read().status,'Existing app rejection message remains visible');
 observations.push({case:'rejected-floor-transition',machineId:machine.id,actualAppCatchAndSync:true,selectRestored:true,sourceStateUnchanged:true,historyEntries:0});x.dispose();
});
await test('choosing-current-floor-or-support-is-no-op-not-an-origin-reset',async()=>{
 for(const attachment of [{xMm:3000.125,zMm:100.375,yawDeg:0.1},{parentId:'desk',surfaceId:'top',xMm:37.125,zMm:-23.75,yawDeg:0.1}]){
  const initial=seed(attachment),saved=S.serializeLayout(initial,catalog),x=fixture(initial),support=x.support();
  support.dispatch('change');await x.settle();assert.equal(x.actions.length,0,'Same-value support choice must not dispatch a reset-to-zero attachment');
  assert.equal(S.serializeLayout(x.engine.read().state,catalog),saved);assert.equal(x.engine.read().past.length,0);assert.equal(x.engine.read().writes.length,0);x.dispose();
 }
});
await test('current-support-comparison-uses-current-attachment-not-captured-shelf-level',async()=>{
 const initial=seed({parentId:'shelf',surfaceId:'lower',xMm:37.125,zMm:-23.75,yawDeg:0.1}),x=fixture(initial),support=x.support();
 const changed=S.applyAction(initial,{type:'SET_ATTACHMENT',id:'neptune',attachment:{...initial.printers[0].attachment,surfaceId:'upper',xMm:40.125,yawDeg:12.25}},catalog);
 x.engine.replace(changed);assert.equal(x.support(),support,'Same parent with new surface preserves editor/control identity');assert.equal(support.value,JSON.stringify(['shelf','upper']));
 support.dispatch('change');await x.settle();assert.equal(x.actions.length,0);assert.deepEqual(x.engine.read().state,changed);
 support.value=JSON.stringify(['shelf','lower']);support.dispatch('change');await x.settle();
 assert.deepEqual(x.actions,[{type:'SET_ATTACHMENT',id:'neptune',attachment:{parentId:'shelf',surfaceId:'lower',xMm:0,zMm:0,yawDeg:0}}]);assert.equal(x.engine.read().past.length,1);x.dispose();
});
await test('sidebar-rotation-emits-safe-world-delta-for-current-selection-not-absolute-patch',async()=>{
 const initial=seed({parentId:'desk',surfaceId:'top',xMm:37.125,zMm:-23.75,yawDeg:0.1}),x=fixture(initial,{recordOnly:true});
 const left=x.container.querySelector('[data-layout-command="layout.rotateLeft"]'),right=x.container.querySelector('[data-layout-command="layout.rotateRight"]');assert(left&&right);
 const changed=S.applyAction(initial,{type:'UPDATE_PRINTER',id:'neptune',patch:{attachment:{yawDeg:12.25,xMm:47.125}}},catalog);x.engine.replace(changed);
 assert.equal(x.container.querySelector('[data-layout-command="layout.rotateRight"]'),right,'Same editor retains the existing event closure');
 right.click();left.click();assert.deepEqual(x.actions,[{type:'rotate-world',id:'neptune',deltaDeg:90},{type:'rotate-world',id:'neptune',deltaDeg:-90}]);
 assert.equal(x.engine.read().state,changed);assert.equal(x.engine.read().past.length,0);x.dispose();
});
for(const p of pins)assert.equal(hash(path.join(site,p)),before[p],'Input changed during focused support test: '+p);
const report={status:results.every(r=>r.passed)?'PASS':'FAIL',cases:results.length,results,observations,inputs:before,scope:'Actual UI/app/state source with fresh DOM fixtures and exact registered Neptune3Plus dimensions; no model loading, GPU/browser or physical support-fit claim.'};
const reportAt=process.argv.indexOf('--report');if(reportAt>=0)fs.writeFileSync(process.argv[reportAt+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
assert.deepEqual(results.filter(r=>!r.passed),[],'Support-control regressions');console.log(JSON.stringify(report));
