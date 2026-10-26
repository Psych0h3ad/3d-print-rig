import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const url=new URL('../site/layout/layout-app.mjs',import.meta.url),app=fs.readFileSync(url,'utf8');
const binding=name=>new URL(app.match(new RegExp(`from ['"](\\./${name.replaceAll('.','\\.')}[^'"]*)['"]`))[1],url);
const S=await import(binding('layout-state.mjs')),G=await import(binding('layout-groups.mjs')),{createLayoutUI}=await import(binding('layout-ui.mjs'));
const {createLayoutTranslator}=await import(new URL('../site/layout/layout-i18n.mjs',import.meta.url));
const row=JSON.parse(fs.readFileSync(new URL('../site/layout/layout-catalog.json',import.meta.url),'utf8')).machines.find(m=>m.id==='siboor_trident_350');assert(row);
const C=[{id:row.id,label:row.label,widthMm:row.dimensionsMm.width,depthMm:row.dimensionsMm.depth,heightMm:row.dimensionsMm.height}, {id:'peer',widthMm:100,depthMm:100,heightMm:300}];
const section=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b,app.indexOf(a)+a.length));
const engine=new Function('initial','catalog','S','G','document','t',`
 const {applyAction,validatePlacement,serializeLayout,worldTransform,resolveWorldRotation,resolveWorldMove,resolveSupportedPrinterRotation}=S;
 const {transformGroup,renameGroup,resolveGroupRotation,resolveGroupMove}=G;
 const past=[],future=[],writes=[],view={setState(){}};
 let state=initial,selected='p',ui=null,busy=false,disposed=false,roomEditing=false,placement=null,operation=null,interactionGeneration=0;
 const $=s=>document.body.querySelector(s),store=()=>writes.push(serializeLayout(state,catalog));
 ${section('function message(','async function ensureEquipmentPreview(')}
 ${section('let pendingRotation=null,discreteRotation=null;','async function render(')}
 ${section('async function act(action){','function updateViewPresentation(')}
 return {act,worldRotate,bind(u){ui=u;sync();},read:()=>({state,past,writes})};`);
const printer=(id='p',machineId=row.id,xMm=0,zMm=0)=>({id,machineId,configurationId:'saved:keep',attachment:{parentId:'bench',surfaceId:'top',xMm,zMm,yawDeg:0}});
const outer=S.createRoomPolygon({polygonMm:[[0,0],[4000,0],[4000,3000],[0,3000]]});
const w=row.dimensionsMm.width,d=row.dimensionsMm.depth;
function seed({edge=false,concave=false,peer=false,width=1200}={}){
 const room=concave?S.createRoomPolygon({polygonMm:[[0,0],[4000,0],[4000,1200],[1800,1200],[1800,3000],[0,3000]]}):outer;
 return S.createDefaultLayout({room,furniture:[S.createDesk({id:'bench',widthMm:width,depthMm:800,heightMm:750,pose:{xMm:800,zMm:500,yawDeg:0}})],printers:[printer('p',row.id,edge?-width/2+w/2:0,edge?-400+d/2:0),...(peer?[printer('other','peer',350,0)]:[])]},C);
}
function fixture(initial){const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p');status.id='layout-status';document.body.append(status,container);const t=createLayoutTranslator('en'),e=engine(initial,C,S,G,document,t),pending=[];const ui=createLayoutUI({container,catalog:C,t,onAction:a=>pending.push(e.act(a))});e.bind(ui);return {e,ui,async numeric(n){const field=container.querySelector('[data-layout-field="yawDeg"]');field.focus();field.value=String(n);field.dispatch('input');for(const fn of field.listeners.get('keydown')??[])fn({key:'Enter',target:field,preventDefault(){}});await Promise.all(pending);}};}
const results=[];async function test(name,fn){await fn();results.push(name);}
const valid=state=>assert.deepEqual(S.validatePlacement(state,C).filter(x=>!x.code.startsWith('DOOR_')),[]);
const encode=s=>S.serializeLayout(s,C);
for(const concave of [false,true])for(const edge of [false,true])await test(`actual SIBOOR numeric 90 endpoint, ${concave?'concave':'rectangular'} room, ${edge?'edge/wall':'centre'}`,async()=>{
 const initial=seed({concave,edge}),x=fixture(initial);try{
  const old=S.resolveWorldRotation(initial,{id:'p',yawDeg:90},C,{snapDeg:0});assert(old.yawDeg<90,'Regression must exercise the old sweep limitation');
  await x.numeric(90);const {state,past,writes}=x.e.read(),a=state.printers[0].attachment;assert.equal(a.yawDeg,90);assert.equal(a.parentId,'bench');assert.equal(a.surfaceId,'top');assert.equal(state.printers[0].configurationId,'saved:keep');assert.equal(a.xMm,edge?-600+d/2:0);assert.equal(a.zMm,initial.printers[0].attachment.zMm);assert.deepEqual(state.furniture,initial.furniture);assert.equal(past.length,1);assert.equal(writes.length,1);valid(state);
  const saved=encode(state);assert.equal(encode(S.parseLayout(saved,C)),saved);await x.e.act({type:'undo'});assert.equal(encode(x.e.read().state),encode(initial));await x.e.act({type:'redo'});assert.equal(encode(x.e.read().state),saved);
 }finally{x.ui.dispose();}
});
await test('actual SIBOOR four +90 turns and reverse complete, no partial-angle history',async()=>{const initial=seed({edge:true}),x=fixture(initial);try{for(let i=1;i<=4;i++){await x.e.act({type:'rotate-world',id:'p',deltaDeg:90});assert.equal(x.e.read().state.printers[0].attachment.yawDeg,i*90);valid(x.e.read().state);}for(let i=3;i>=0;i--){await x.e.act({type:'rotate-world',id:'p',deltaDeg:-90});assert.equal(x.e.read().state.printers[0].attachment.yawDeg,i*90);valid(x.e.read().state);}assert.equal(encode(x.e.read().state),encode(initial));assert.equal(x.e.read().past.length,8);}finally{x.ui.dispose();}});
await test('nearest final peer separation without changing support or peer',async()=>{const initial=seed({peer:true}),result=S.resolveSupportedPrinterRotation(initial,{id:'p',yawDeg:90},C);assert(result);valid(result.state);const a=result.state.printers[0].attachment;assert(Math.abs(a.xMm-(300-d/2))<1e-6);assert(Math.abs(a.zMm)<1e-6);assert.deepEqual(result.state.printers[1],initial.printers[1]);});
await test('no final-fit orientation rejects atomically instead of committing a prefix angle',async()=>{const initial=seed({width:600}),x=fixture(initial);try{await x.numeric(90);assert.equal(encode(x.e.read().state),encode(initial));assert.equal(x.e.read().past.length,0);}finally{x.ui.dispose();}});
await test('continuous supported handle solver retains original sweep rule',()=>{const initial=seed(),r=S.resolveWorldRotation(initial,{id:'p',yawDeg:90},C,{snapDeg:0});assert(r.yawDeg>0&&r.yawDeg<90);valid(r.state);});
await test('floor quarter turn retains the continuous diagonal limitation',async()=>{
 const initial=S.createDefaultLayout({room:S.createRoomRect({widthMm:1200,depthMm:800}),printers:[{...printer(),attachment:{parentId:null,surfaceId:'floor',xMm:0,zMm:0,yawDeg:0}}]},C),x=fixture(initial);
 try{const expected=S.resolveWorldRotation(initial,{id:'p',yawDeg:90},C,{snapDeg:0,anchorPointMm:{xMm:0,zMm:0},targetLocalYawDeg:90});await x.e.act({type:'rotate-world',id:'p',deltaDeg:90});assert(expected.yawDeg<90);assert.equal(encode(x.e.read().state),encode(expected.state));assert.equal(S.resolveSupportedPrinterRotation(initial,{id:'p',yawDeg:90},C),false);}finally{x.ui.dispose();}
});
await test('group with supported printer retains its continuous rigid-group rule',async()=>{
 const initial=G.createGroup(seed(),{id:'cell',name:'Cell',memberIds:['bench']},C),x=fixture(initial),pose=initial.groups[0].pose;
 try{const expected=G.resolveGroupRotation(initial,{id:'cell',yawDeg:90},C,{snapDeg:0,anchorPointMm:{xMm:pose.xMm,zMm:pose.zMm}});await x.e.act({type:'rotate-world',id:'cell',deltaDeg:90});assert.equal(encode(x.e.read().state),encode(expected.state));assert.deepEqual(x.e.read().state.printers[0].attachment,initial.printers[0].attachment);}finally{x.ui.dispose();}
});
console.log(JSON.stringify({status:'PASS',cases:results.length,results,catalogMachine:{id:row.id,dimensionsMm:row.dimensionsMm},scope:'Small actual catalog-dimension and production UI/app endpoint-placement regressions only; no browser, model decode, CAD/native or continuous-motion claim for discrete pick-up edits.'}));
