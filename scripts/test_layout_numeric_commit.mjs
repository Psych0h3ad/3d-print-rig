// Production UI events and app transactions; tiny synthetic layouts, no models.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),at=process.argv.indexOf('--site');
const site=at<0?path.join(root,'site'):path.resolve(process.argv[at+1]);
const appURL=pathToFileURL(path.join(site,'layout/layout-app.mjs')),app=fs.readFileSync(appURL,'utf8');
const binding=name=>{const m=app.match(new RegExp(`from ['"](\\./${name.replaceAll('.','\\.')}[^'"]*)['"]`));assert(m,`Missing app import ${name}`);return new URL(m[1],appURL);};
const S=await import(binding('layout-state.mjs')),G=await import(binding('layout-groups.mjs'));
const {createLayoutUI}=await import(binding('layout-ui.mjs'));
const {createLayoutTranslator,supportedLanguages}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const files=['layout-ui.mjs','layout-app.mjs','layout-state.mjs','layout-groups.mjs','layout-group-labels.mjs','layout-i18n.mjs'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(site,'layout',p))).digest('hex')]));
const before=hashes(),results=[];
const section=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert(a>=0&&b>a,`App section ${start}`);return app.slice(a,b);};
// History, serialization, placement validation, errors and rollback are the real
// application bodies. Only storage, renderer and DOM are controlled ports.
const engineFactory=new Function('initial','selection','catalog','S','G','document','t',`
 const {applyAction,validatePlacement,serializeLayout,worldTransform,resolveWorldRotation,resolveWorldMove,resolveSupportedPrinterRotation}=S,{transformGroup,renameGroup,resolveGroupRotation,resolveGroupMove}=G;
 const past=[],future=[],writes=[],view={setState(){}};
 let state=initial,selected=selection,ui=null,busy=false,disposed=false,roomEditing=false,placement=null,operation=null,interactionGeneration=0;
 const $=selector=>document.body.querySelector(selector),store=()=>writes.push(serializeLayout(state,catalog));
 ${section('function message(','async function ensureEquipmentPreview(')}
 ${section('let pendingRotation=null,discreteRotation=null;','async function render(')}
 ${section('async function act(action){','function updateViewPresentation(')}
 return {act,select,sync,bind(value){ui=value;sync();},read:()=>({state,past:[...past],future:[...future],writes:[...writes]})};`);
const catalog=[{id:'numeric-printer',label:'Synthetic numeric fixture',widthMm:240,depthMm:200,heightMm:300}];
const printer=(id,parentId,xMm,zMm,yawDeg=5.125)=>({id,machineId:'numeric-printer',configurationId:null,attachment:{parentId,surfaceId:parentId?'top':'floor',xMm,zMm,yawDeg}});
function seed(){
 let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:12000,depthMm:8000}),furniture:[
  S.createDesk({id:'desk-1',widthMm:1200.375,depthMm:700.625,pose:{xMm:-3000.125,zMm:-1000.375,yawDeg:7.125}}),
  S.createShelf({id:'shelf-1',widthMm:1000.375,depthMm:500.625,heightMm:1900.875,pose:{xMm:3000.25,zMm:1000.5,yawDeg:0},levels:[{id:'low',topMm:300.125},{id:'middle',topMm:900.375},{id:'high',topMm:1600.625}]})
 ],printers:[printer('floor-printer',null,.125,1500.375,11.125),printer('peer-printer',null,1200.125,1500.375),printer('desk-printer','desk-1',.125,-.375)]},catalog);
 state=G.createGroup(state,{id:'unit-g',name:'Production bank',memberIds:['desk-1']},catalog);
 return S.parseLayout(JSON.stringify({...state,groups:state.groups.map(g=>({...g,label:'G'}))}),catalog);
}
function fixture(language='en',selection='desk-1'){
 const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p');status.id='layout-status';document.body.append(status,container);
 document.location={href:'https://example.test/rig/layout/index.html'};document.documentElement={lang:language};
 const t=createLayoutTranslator(language),initial=seed(),engine=engineFactory(initial,selection,catalog,S,G,document,t),actions=[],pending=[];
 const ui=createLayoutUI({container,catalog,t,onAction:action=>{actions.push(structuredClone(action));const result=engine.act(action);pending.push(result);return result;}});engine.bind(ui);
 const field=name=>{const n=container.querySelector(`[data-layout-field=${name}]`);assert(n,`Missing number ${name}`);return n;};
 const feedback=()=>container.querySelectorAll('p').find(n=>n.className==='layout-feedback');
 return {document,container,ui,engine,initial,actions,t,field,feedback,async settle(){await Promise.all(pending);await Promise.resolve();},dispose(){ui.dispose();}};
}
const desk=s=>s.furniture.find(e=>e.id==='desk-1'),shelf=s=>s.furniture.find(e=>e.id==='shelf-1');
const floor=s=>s.printers.find(e=>e.id==='floor-printer'),supported=s=>s.printers.find(e=>e.id==='desk-printer'),group=s=>s.groups[0];
const commits=[
 {name:'furniture width',id:'desk-1',field:'widthMm',value:1250.625,read:s=>desk(s).widthMm,action:{type:'UPDATE_FURNITURE',id:'desk-1',patch:{widthMm:1250.625}}},
 {name:'furniture X',id:'desk-1',field:'xMm',value:-2900.875,read:s=>desk(s).pose.xMm,action:{type:'UPDATE_FURNITURE',id:'desk-1',patch:{pose:{xMm:-2900.875}}}},
 {name:'shelf board height',id:'shelf-1',field:'board-middle',value:950.875,read:s=>shelf(s).levels[1].topMm,action:{type:'UPDATE_FURNITURE',id:'shelf-1',patch:{levels:[{id:'low',topMm:300.125},{id:'middle',topMm:950.875},{id:'high',topMm:1600.625}]}}},
 {name:'shelf depth',id:'shelf-1',field:'depthMm',value:550.625,read:s=>shelf(s).depthMm,action:{type:'UPDATE_FURNITURE',id:'shelf-1',patch:{depthMm:550.625}}},
 {name:'floor printer yaw',id:'floor-printer',field:'yawDeg',value:22.375,read:s=>floor(s).attachment.yawDeg,action:{type:'UPDATE_PRINTER',id:'floor-printer',patch:{attachment:{yawDeg:22.375}}}},
 {name:'supported printer local Z',id:'desk-printer',field:'zMm',value:-15.625,read:s=>supported(s).attachment.zMm,action:{type:'UPDATE_PRINTER',id:'desk-printer',patch:{attachment:{zMm:-15.625}}}},
 {name:'unit X',id:'unit-g',field:'xMm',value:-2800.625,read:s=>group(s).pose.xMm,action:{type:'group-transform',id:'unit-g',patch:{xMm:-2800.625}}},
 {name:'unit yaw',id:'unit-g',field:'yawDeg',value:13.375,read:s=>group(s).pose.yawDeg,action:{type:'group-transform',id:'unit-g',patch:{yawDeg:13.375}}}
];
function enter(node,extra={}){
 const event={target:node,type:'keydown',key:'Enter',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...extra};
 for(const handler of node.listeners.get('keydown')||[])handler(event);
 return event;
}
function input(node,value){node.focus();node.value=String(value);node.dispatch('input');}
function finish(node,order){
 if(order.startsWith('enter-'))assert.equal(enter(node).defaultPrevented,true,'Enter commits locally instead of a form default');
 if(order==='blur-first'||order==='enter-blur-change'){node.blur();node.dispatch('change');}
 else {node.dispatch('change');node.blur();}
}
const orders=['blur-first','change-first','enter-blur-change','enter-change-blur'];
async function test(name,run){try{await run();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.stack});}}
function unchanged(x,original){const r=x.engine.read();assert.equal(S.serializeLayout(r.state,catalog),original);assert.equal(r.past.length,0);assert.equal(r.future.length,0);assert.equal(r.writes.length,0);}
function retainedError(x,text){const f=x.feedback();assert.equal(f.hidden,false);assert.equal(f.dataset.error,'true');assert.equal(f.textContent,text);}

for(const language of supportedLanguages)for(const c of commits)for(const order of orders)await test(`${language}/${c.name}/${order}: one exact commit, undo/redo`,async()=>{
 const x=fixture(language,c.id),original=S.serializeLayout(x.initial,catalog),n=x.field(c.field);
 try{
  input(n,c.value);finish(n,order);await x.settle();
  let r=x.engine.read();assert.equal(c.read(r.state),c.value);assert.deepEqual(x.actions,[c.action]);
  assert.equal(r.past.length,1);assert.equal(r.future.length,0);assert.equal(r.writes.length,1);assert.equal(group(r.state).label,'G');
  assert.equal(n.value,c.value.toFixed(1));assert.equal(S.serializeLayout(S.parseLayout(r.writes[0],catalog),catalog),S.serializeLayout(r.state,catalog));
  n.dispatch('change');n.blur();enter(n);await x.settle();assert.equal(x.actions.length,1);assert.equal(x.engine.read().past.length,1);assert.equal(x.engine.read().writes.length,1);
  const committed=S.serializeLayout(x.engine.read().state,catalog);await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),original);
  await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,catalog),committed);assert.equal(group(x.engine.read().state).label,'G');
 }finally{x.dispose();}
});

for(const language of supportedLanguages)await test(`${language}: untouched rounded numbers and explicit exact no-ops retain full precision`,async()=>{
 for(const c of commits){const x=fixture(language,c.id),original=S.serializeLayout(x.initial,catalog),raw=c.read(x.initial),n=x.field(c.field);
  try{
   assert.equal(n.value,raw.toFixed(1));n.focus();enter(n);n.blur();n.dispatch('change');await x.settle();unchanged(x,original);assert.deepEqual(x.actions,[]);
   input(n,raw);finish(n,'blur-first');await x.settle();unchanged(x,original);assert.deepEqual(x.actions,[]);assert.equal(c.read(x.engine.read().state),raw);
  }finally{x.dispose();}
 }
});

const invalids=[{id:'desk-1',field:'widthMm',value:''},{id:'desk-1',field:'widthMm',value:-1},{id:'unit-g',field:'xMm',value:'Infinity'}];
for(const language of supportedLanguages)for(const c of invalids)for(const order of ['blur-first','change-first','enter-blur-change'])await test(`${language}/${c.id}/${c.field}=${JSON.stringify(c.value)}/${order}: invalid rollback keeps error and no history`,async()=>{
 const x=fixture(language,c.id),original=S.serializeLayout(x.initial,catalog),n=x.field(c.field),display=n.value;
 try{
  input(n,c.value);finish(n,order);await x.settle();unchanged(x,original);assert.deepEqual(x.actions,[]);assert.equal(n.value,display);assert.equal(n.getAttribute('aria-invalid'),'true');
  retainedError(x,x.t('layout.validNumber'));n.dispatch('change');n.blur();enter(n);x.engine.sync();await x.settle();unchanged(x,original);assert.deepEqual(x.actions,[]);retainedError(x,x.t('layout.validNumber'));
 }finally{x.dispose();}
});

const rejections=[
 {name:'furniture outside room',id:'desk-1',field:'xMm',value:-10000,read:s=>desk(s).pose.xMm,key:'layout.error.ROOM_OUT_OF_BOUNDS',recovery:-2900.875},
 {name:'unit outside room',id:'unit-g',field:'xMm',value:10000,read:s=>group(s).pose.xMm,key:'layout.error.ROOM_OUT_OF_BOUNDS',recovery:-2800.625},
 {name:'supported printer overhang',id:'desk-printer',field:'zMm',value:1000,read:s=>supported(s).attachment.zMm,key:'layout.error.SURFACE_OVERHANG',recovery:-15.625},
 {name:'floor printer peer collision',id:'floor-printer',field:'xMm',value:1200.125,read:s=>floor(s).attachment.xMm,key:'layout.error.ENVELOPE_OVERLAP',recovery:20.625},
 {name:'shelf boards unordered',id:'shelf-1',field:'board-middle',value:50,read:s=>shelf(s).levels[1].topMm,key:'layout.error.SHELF_BOARDS_OVERLAP_OR_UNORDERED',recovery:950.875}
];
for(const language of supportedLanguages)for(const c of rejections)for(const order of ['blur-first','change-first','enter-change-blur'])await test(`${language}/${c.name}/${order}: actual app rejects atomically and a valid retry recovers`,async()=>{
 const x=fixture(language,c.id),original=S.serializeLayout(x.initial,catalog),n=x.field(c.field),display=n.value;
 try{
  input(n,c.value);finish(n,order);await x.settle();unchanged(x,original);assert.equal(x.actions.length,1);assert.equal(c.read(x.engine.read().state),c.read(x.initial));assert.equal(n.value,display);
  let expected;try{expected=x.t(c.key);}catch{expected=x.t('layout.error.generic');}retainedError(x,expected);
  n.dispatch('change');n.blur();enter(n);x.engine.sync();await x.settle();unchanged(x,original);assert.equal(x.actions.length,1);retainedError(x,expected);
  input(n,c.recovery);finish(n,'blur-first');await x.settle();assert.equal(c.read(x.engine.read().state),c.recovery);assert.equal(x.engine.read().past.length,1);assert.equal(x.engine.read().writes.length,1);assert.equal(x.actions.length,2);assert.equal(x.feedback().hidden,true);
 }finally{x.dispose();}
});

for(const language of supportedLanguages)for(const order of orders)await test(`${language}/room draft/${order}: exact draft survives tabs and applies only on Update room`,async()=>{
 const x=fixture(language),original=S.serializeLayout(x.initial,catalog),n=x.field('room-width');
 try{
  input(n,13600.375);finish(n,order);await x.settle();unchanged(x,original);assert.deepEqual(x.actions,[]);
  x.container.querySelector('#layout-tab-add').click();x.container.querySelector('#layout-tab-room').click();x.engine.sync();assert.equal(n.value,'13600.4');unchanged(x,original);
  x.container.querySelector('#layout-room-apply').click();await x.settle();const r=x.engine.read();assert.equal(x.actions.length,1);assert.equal(x.actions[0].type,'SET_ROOM');assert.deepEqual(r.state.room.polygonMm,[[-6800.1875,-4000],[6800.1875,-4000],[6800.1875,4000],[-6800.1875,4000]]);assert.equal(r.past.length,1);assert.equal(r.writes.length,1);
  x.container.querySelector('#layout-room-apply').click();n.dispatch('change');n.blur();await x.settle();assert.equal(x.actions.length,1);assert.equal(x.engine.read().past.length,1);
 }finally{x.dispose();}
});

await test('Enter ignores composition/modifiers/repeats; readonly/busy fields never commit',async()=>{
 const x=fixture(),original=S.serializeLayout(x.initial,catalog),n=x.field('widthMm');
 try{
  input(n,1250.625);for(const options of [{isComposing:true},{ctrlKey:true},{metaKey:true},{altKey:true},{repeat:true}]){assert.equal(enter(n,options).defaultPrevented,false);unchanged(x,original);}
  x.ui.setStatus({busy:true});enter(n);unchanged(x,original);assert.deepEqual(x.actions,[]);x.ui.setStatus({busy:false});finish(n,'blur-first');await x.settle();assert.equal(x.actions.length,1);
  const thickness=x.field('topThicknessMm');assert.equal(thickness.readOnly,true);input(thickness,40);finish(thickness,'enter-blur-change');await x.settle();assert.equal(x.actions.length,1);assert.equal(desk(x.engine.read().state).topThicknessMm,30);
 }finally{x.dispose();}
});

assert.deepEqual(hashes(),before,'Numeric test input source changed during run');
const report={status:results.every(r=>r.pass)?'PASS':'FAIL',cases:results.length,results,sourceSHA256:before,execArgv:process.execArgv,scope:'Production UI event listeners and production app commit/error/sync/undo/redo, actual state/group validators on tiny synthetic layouts. DOM/storage/renderer ports; no browser, model or native clearance claim.'};
const output=process.argv.indexOf('--report');if(output>=0)fs.writeFileSync(process.argv[output+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:report.status,cases:report.cases,failures:results.filter(r=>!r.pass)}));
assert.equal(report.status,'PASS','Numeric inspector commit integration regressions');
